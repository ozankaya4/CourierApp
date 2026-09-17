create schema if not exists private;
revoke all on schema private from public;

create type public.account_role as enum ('customer', 'restaurant', 'courier');
create type public.order_status as enum ('placed', 'accepted', 'preparing', 'ready', 'picked_up', 'delivered', 'cancelled');

create table private.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.account_role not null,
  display_name text not null check (length(display_name) between 2 and 80),
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
create table private.restaurants (
  id uuid primary key references private.profiles(id),
  name text not null check (length(name) between 2 and 100),
  description text not null default '' check (length(description) <= 1000),
  address text not null check (length(address) between 5 and 500),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  is_open boolean not null default false,
  delivery_fee integer not null default 0 check (delivery_fee between 0 and 100000),
  minimum_order integer not null default 0 check (minimum_order between 0 and 1000000)
);
create table private.menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references private.restaurants(id),
  name text not null check (length(name) between 2 and 100),
  description text not null default '' check (length(description) <= 1000),
  price integer not null check (price between 1 and 1000000),
  available boolean not null default true
);
create index menu_items_restaurant_idx on private.menu_items(restaurant_id);
create table private.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references private.profiles(id),
  restaurant_id uuid not null references private.restaurants(id),
  courier_id uuid references private.profiles(id),
  status public.order_status not null default 'placed',
  total integer not null check (total > 0),
  delivery_fee integer not null,
  payment_method text not null default 'cash_on_delivery' check (payment_method = 'cash_on_delivery'),
  address text not null check (length(address) between 5 and 500),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  request_id uuid not null,
  request_payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, request_id)
);
create index orders_customer_idx on private.orders(customer_id, created_at desc);
create index orders_restaurant_idx on private.orders(restaurant_id, created_at desc);
create index orders_courier_idx on private.orders(courier_id, created_at desc);
create index orders_available_idx on private.orders(created_at) where status = 'ready' and courier_id is null;
create unique index courier_one_active_order on private.orders(courier_id) where courier_id is not null and status in ('ready', 'picked_up');
create table private.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references private.orders(id) on delete cascade,
  menu_item_id uuid not null references private.menu_items(id),
  name text not null,
  quantity integer not null check (quantity between 1 and 20),
  unit_price integer not null check (unit_price > 0),
  unique (order_id, menu_item_id)
);
create table private.locations (
  order_id uuid primary key references private.orders(id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy double precision not null check (accuracy between 0 and 100),
  recorded_at timestamptz not null,
  received_at timestamptz not null default now()
);
create table private.reviews (
  order_id uuid primary key references private.orders(id),
  restaurant smallint not null check (restaurant between 1 and 5),
  service smallint not null check (service between 1 and 5),
  courier smallint not null check (courier between 1 and 5),
  created_at timestamptz not null default now()
);
create table private.item_reviews (
  order_item_id uuid primary key references private.order_items(id),
  order_id uuid not null references private.reviews(order_id),
  score smallint not null check (score between 1 and 5)
);
create index item_reviews_order_idx on private.item_reviews(order_id);
create table private.webhook_receipts (
  event_id uuid primary key,
  payload_hash text not null,
  received_at timestamptz not null default now()
);

-- Events contain no coordinates, addresses, names or order items.
-- Subscribers refetch a role-specific projection after each event.
create table public.order_events (
  order_id uuid primary key references private.orders(id) on delete cascade,
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.order_events enable row level security;
revoke all on public.order_events from anon, authenticated;
grant select on public.order_events to authenticated;

do $$ declare t text; begin
  foreach t in array array['profiles','restaurants','menu_items','orders','order_items','locations','reviews','item_reviews','webhook_receipts'] loop
    execute format('alter table private.%I enable row level security', t);
  end loop;
end $$;

create function private.emit_event(p_order uuid) returns void language sql set search_path = '' as $$
  insert into public.order_events(order_id) values(p_order)
  on conflict(order_id) do update set revision = public.order_events.revision + 1, updated_at = clock_timestamp();
$$;
create function private.can_read_event(p_order uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from private.orders o join private.profiles p
      on p.id in (o.customer_id, o.restaurant_id, o.courier_id)
    where o.id = p_order and p.user_id = (select auth.uid()) and p.approved
  );
$$;
create policy participant_events on public.order_events for select to authenticated
  using (private.can_read_event(order_id));

create function private.order_json(p_order uuid, p_role public.account_role) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', o.id, 'status', o.status, 'created_at', o.created_at, 'total', o.total,
    'courier_id', o.courier_id,
    'restaurant', jsonb_build_object('id',r.id,'name',r.name,'address',r.address,'latitude',r.latitude,'longitude',r.longitude),
    'destination', case when p_role = 'customer' or (p_role = 'courier' and o.status = 'picked_up')
      then jsonb_build_object('address',o.address,'latitude',o.latitude,'longitude',o.longitude) else null end,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'menu_item_id',i.menu_item_id,'name',i.name,'quantity',i.quantity,'unit_price',i.unit_price)), '[]'::jsonb) from private.order_items i where i.order_id = o.id),
    'location', case when o.status in ('ready','picked_up') and (p_role <> 'restaurant' or o.status = 'ready') then (select jsonb_build_object('latitude',l.latitude,'longitude',l.longitude,'accuracy',l.accuracy,'recorded_at',l.recorded_at) from private.locations l where l.order_id = o.id) else null end,
    'reviewed', exists(select 1 from private.reviews v where v.order_id = o.id)
  ) from private.orders o join private.restaurants r on r.id = o.restaurant_id where o.id = p_order;
$$;

create function private.publish_location(p_order uuid, p_courier uuid, p_data jsonb) returns boolean
language plpgsql set search_path = '' as $$
declare o private.orders; stamp timestamptz; previous private.locations;
begin
  select * into o from private.orders where id = p_order for update;
  if o.id is null or o.courier_id is distinct from p_courier or o.status not in ('ready','picked_up') then
    raise exception 'Aktif teslimata erişim yok.' using errcode = '42501';
  end if;
  stamp := (p_data->>'recorded_at')::timestamptz;
  if stamp is null or not isfinite(stamp) or stamp < now() - interval '30 seconds' or stamp > now() + interval '30 seconds' then
    raise exception 'Konum zaman damgası geçersiz.';
  end if;
  select * into previous from private.locations where order_id = p_order;
  if previous.recorded_at >= stamp or previous.received_at > clock_timestamp() - interval '3 seconds' then return false; end if;
  insert into private.locations(order_id, latitude, longitude, accuracy, recorded_at)
    values (p_order,(p_data->>'latitude')::float8,(p_data->>'longitude')::float8,(p_data->>'accuracy')::float8,stamp)
    on conflict(order_id) do update set latitude = excluded.latitude, longitude = excluded.longitude,
      accuracy = excluded.accuracy, recorded_at = excluded.recorded_at, received_at = clock_timestamp();
  perform private.emit_event(p_order);
  return true;
end $$;

-- One authenticated API entry point. Every privileged operation checks its
-- caller against stored profiles; client metadata never grants permission.
create function private.app(p_action text, p_payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); selected_role public.account_role; profile private.profiles;
  o private.orders; rest private.restaurants; item private.menu_items;
  item_data jsonb; total_price integer := 0; new_id uuid; qty integer; target public.order_status;
  result jsonb; cart_count integer; saved_payload jsonb;
begin
  if uid is null then raise exception 'Giriş yapmalısın.' using errcode = '42501'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'Geçersiz istek.'; end if;
  if p_action = 'profiles.list' then
    return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'role',role,'display_name',display_name,'approved',approved) order by role), '[]'::jsonb) from private.profiles where user_id = uid);
  end if;
  selected_role := (p_payload->>'role')::public.account_role;
  if selected_role is null then raise exception 'Hesap türü seçmelisin.'; end if;
  if p_action = 'profiles.create' then
    insert into private.profiles(user_id,role,display_name,approved)
      values(uid,selected_role,trim(p_payload->>'display_name'),selected_role = 'customer') returning id into new_id;
    return jsonb_build_object('id',new_id);
  end if;
  select * into profile from private.profiles where user_id = uid and role = selected_role;
  if profile.id is null or not profile.approved then raise exception 'Bu profil henüz işlem yapamaz.' using errcode = '42501'; end if;

  if p_action = 'catalog' then
    return jsonb_build_object(
      'restaurants', (select coalesce(jsonb_agg(to_jsonb(r) order by r.name),'[]'::jsonb) from private.restaurants r join private.profiles p on p.id=r.id where p.approved),
      'menu', (select coalesce(jsonb_agg(to_jsonb(m) order by m.name),'[]'::jsonb) from private.menu_items m join private.profiles p on p.id=m.restaurant_id where p.approved and (m.available or m.restaurant_id = profile.id))
    );
  elsif p_action = 'restaurant.save' and selected_role = 'restaurant' then
    insert into private.restaurants(id,name,description,address,latitude,longitude,is_open,delivery_fee,minimum_order)
      values(profile.id,trim(p_payload->>'name'),coalesce(p_payload->>'description',''),trim(p_payload->>'address'),
        (p_payload->>'latitude')::float8,(p_payload->>'longitude')::float8,(p_payload->>'is_open')::boolean,
        (p_payload->>'delivery_fee')::integer,(p_payload->>'minimum_order')::integer)
      on conflict(id) do update set name=excluded.name,description=excluded.description,address=excluded.address,
        latitude=excluded.latitude,longitude=excluded.longitude,is_open=excluded.is_open,
        delivery_fee=excluded.delivery_fee,minimum_order=excluded.minimum_order;
    return jsonb_build_object('id',profile.id);
  elsif p_action = 'menu.save' and selected_role = 'restaurant' then
    new_id := coalesce((p_payload->>'id')::uuid,gen_random_uuid());
    if exists(select 1 from private.menu_items where id = new_id and restaurant_id <> profile.id) then
      raise exception 'Ürüne erişim yok.' using errcode = '42501';
    end if;
    insert into private.menu_items(id,restaurant_id,name,description,price,available)
      values(new_id,profile.id,trim(p_payload->>'name'),coalesce(p_payload->>'description',''),(p_payload->>'price')::integer,coalesce((p_payload->>'available')::boolean,true))
      on conflict(id) do update set name=excluded.name,description=excluded.description,price=excluded.price,available=excluded.available;
    return jsonb_build_object('id',new_id);
  elsif p_action = 'orders.create' and selected_role = 'customer' then
    saved_payload := p_payload - 'request_id';
    -- Serialize retries per customer, including concurrent requests.
    perform 1 from private.profiles where id=profile.id for update;
    select * into o from private.orders where customer_id=profile.id and request_id=(p_payload->>'request_id')::uuid;
    if o.id is not null then
      if o.request_payload <> saved_payload then raise exception 'İstek numarası farklı bir siparişte kullanılmış.'; end if;
      return jsonb_build_object('id',o.id);
    end if;
    select r.* into rest from private.restaurants r join private.profiles p on p.id=r.id
      where r.id=(p_payload->>'restaurant_id')::uuid and p.approved and r.is_open for share of r;
    if rest.id is null then raise exception 'Restoran şu anda sipariş almıyor.'; end if;
    if jsonb_typeof(p_payload->'items') is distinct from 'array' then raise exception 'Sepet geçersiz.'; end if;
    cart_count := jsonb_array_length(p_payload->'items');
    if cart_count < 1 or cart_count > 30 then raise exception 'Sepet 1–30 farklı ürün içermeli.'; end if;
    if (select count(distinct v->>'menu_item_id') from jsonb_array_elements(p_payload->'items') v) <> cart_count then raise exception 'Sepette tekrarlanan ürün var.'; end if;
    for item_data in select * from jsonb_array_elements(p_payload->'items') loop
      qty := (item_data->>'quantity')::integer;
      if qty is null or qty not between 1 and 20 then raise exception 'Ürün adedi 1–20 olmalı.'; end if;
      select * into item from private.menu_items where id=(item_data->>'menu_item_id')::uuid and restaurant_id=rest.id and available for share;
      if item.id is null then raise exception 'Ürün satışta değil veya başka bir restorana ait.'; end if;
      total_price := total_price + item.price * qty;
    end loop;
    if total_price < rest.minimum_order then raise exception 'Minimum sipariş tutarına ulaşılmadı.'; end if;
    insert into private.orders(customer_id,restaurant_id,total,delivery_fee,address,latitude,longitude,request_id,request_payload)
      values(profile.id,rest.id,total_price+rest.delivery_fee,rest.delivery_fee,trim(p_payload->>'address'),
        (p_payload->>'latitude')::float8,(p_payload->>'longitude')::float8,(p_payload->>'request_id')::uuid,saved_payload) returning id into new_id;
    for item_data in select * from jsonb_array_elements(p_payload->'items') loop
      select * into item from private.menu_items where id=(item_data->>'menu_item_id')::uuid;
      insert into private.order_items(order_id,menu_item_id,name,quantity,unit_price)
        values(new_id,item.id,item.name,(item_data->>'quantity')::integer,item.price);
    end loop;
    perform private.emit_event(new_id);
    return jsonb_build_object('id',new_id);
  elsif p_action = 'orders.list' then
    return (select coalesce(jsonb_agg(private.order_json(q.id,selected_role) order by q.created_at desc),'[]'::jsonb) from (
      select id,created_at from private.orders where
        (selected_role='customer' and customer_id=profile.id) or
        (selected_role='restaurant' and restaurant_id=profile.id) or
        (selected_role='courier' and (courier_id=profile.id or (status='ready' and courier_id is null)))
      order by created_at desc limit 100
    ) q);
  end if;

  select * into o from private.orders where id=(p_payload->>'order_id')::uuid for update;
  if o.id is null then raise exception 'Siparişe erişim yok.' using errcode = '42501'; end if;
  if p_action = 'orders.claim' and selected_role = 'courier' then
    if o.status <> 'ready' or o.courier_id is not null then raise exception 'Sipariş başka bir kurye tarafından alınmış.'; end if;
    update private.orders set courier_id=profile.id,updated_at=now() where id=o.id;
    perform private.emit_event(o.id);
    return private.order_json(o.id,selected_role);
  end if;
  if not ((selected_role='customer' and o.customer_id=profile.id) or
    (selected_role='restaurant' and o.restaurant_id=profile.id) or
    (selected_role='courier' and o.courier_id=profile.id)) then
    raise exception 'Siparişe erişim yok.' using errcode = '42501';
  end if;
  if p_action = 'orders.get' then return private.order_json(o.id,selected_role);
  elsif p_action = 'orders.transition' then
    target := (p_payload->>'status')::public.order_status;
    if target is null or not (
      (selected_role='customer' and o.status='placed' and target='cancelled') or
      (selected_role='restaurant' and ((o.status='placed' and target in ('accepted','cancelled')) or (o.status='accepted' and target='preparing') or (o.status='preparing' and target='ready'))) or
      (selected_role='courier' and ((o.status='ready' and target='picked_up') or (o.status='picked_up' and target='delivered')))
    ) then raise exception 'Bu durum değişikliğine izin verilmiyor.' using errcode = '42501'; end if;
    update private.orders set status=target,updated_at=now() where id=o.id;
    if target in ('delivered','cancelled') then delete from private.locations where order_id=o.id; end if;
    perform private.emit_event(o.id);
    return private.order_json(o.id,selected_role);
  elsif p_action = 'locations.publish' and selected_role='courier' then
    return jsonb_build_object('accepted',private.publish_location(o.id,profile.id,p_payload));
  elsif p_action = 'reviews.create' and selected_role='customer' then
    if o.status <> 'delivered' then raise exception 'Sadece teslim edilen sipariş puanlanabilir.'; end if;
    if jsonb_typeof(p_payload->'items') is distinct from 'array' then raise exception 'Yemek puanları eksik.'; end if;
    cart_count := (select count(*) from private.order_items where order_id=o.id);
    if jsonb_array_length(p_payload->'items') <> cart_count or
      (select count(distinct v->>'order_item_id') from jsonb_array_elements(p_payload->'items') v) <> cart_count then
      raise exception 'Her yemek bir kez puanlanmalı.';
    end if;
    insert into private.reviews(order_id,restaurant,service,courier)
      values(o.id,(p_payload->>'restaurant')::smallint,(p_payload->>'service')::smallint,(p_payload->>'courier')::smallint);
    for item_data in select * from jsonb_array_elements(p_payload->'items') loop
      if not exists(select 1 from private.order_items where id=(item_data->>'order_item_id')::uuid and order_id=o.id) then
        raise exception 'Yemek bu siparişe ait değil.';
      end if;
      insert into private.item_reviews(order_item_id,order_id,score) values((item_data->>'order_item_id')::uuid,o.id,(item_data->>'score')::smallint);
    end loop;
    perform private.emit_event(o.id);
    return jsonb_build_object('saved',true);
  end if;
  raise exception 'İşlem bulunamadı veya bu role açık değil.' using errcode = '42501';
end $$;

create function public.app(p_action text, p_payload jsonb default '{}'::jsonb) returns jsonb
language sql security invoker set search_path = '' as $$ select private.app(p_action,p_payload); $$;

-- Trusted delivery-provider webhook. Browser and mobile credentials cannot call this.
create function private.delivery_webhook(p_event_id uuid, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare saved text; fingerprint text; approved_courier boolean;
begin
  if coalesce(current_setting('request.jwt.claims', true),'{}')::jsonb->>'role' is distinct from 'service_role' then
    raise exception 'Sunucu yetkisi gerekli.' using errcode='42501';
  end if;
  fingerprint := encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
  insert into private.webhook_receipts(event_id,payload_hash) values(p_event_id,fingerprint) on conflict do nothing;
  if not found then
    select payload_hash into saved from private.webhook_receipts where event_id=p_event_id;
    if saved <> fingerprint then raise exception 'Olay numarası farklı veriyle tekrar kullanıldı.'; end if;
    return jsonb_build_object('duplicate',true);
  end if;
  select approved and role='courier' into approved_courier from private.profiles where id=(p_payload->>'courier_id')::uuid;
  if approved_courier is distinct from true then raise exception 'Kurye etkin değil.'; end if;
  return jsonb_build_object('accepted',private.publish_location((p_payload->>'order_id')::uuid,(p_payload->>'courier_id')::uuid,p_payload));
end $$;
create function public.delivery_webhook(p_event_id uuid, p_payload jsonb) returns jsonb
language sql security invoker set search_path = '' as $$ select private.delivery_webhook(p_event_id,p_payload); $$;

revoke all on all tables in schema private from public,anon,authenticated;
revoke execute on all functions in schema private from public,anon,authenticated;
revoke execute on function public.app(text,jsonb) from public,anon;
revoke execute on function public.delivery_webhook(uuid,jsonb) from public,anon,authenticated;
grant usage on schema private to authenticated,service_role;
grant execute on function private.app(text,jsonb),private.can_read_event(uuid) to authenticated;
grant execute on function public.app(text,jsonb) to authenticated;
grant execute on function private.delivery_webhook(uuid,jsonb),public.delivery_webhook(uuid,jsonb) to service_role;
alter publication supabase_realtime add table public.order_events;
