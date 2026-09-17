"use client";
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { isLocationFresh, type Order } from "@courier/core";

export default function OrderMap({ order }: { order: Order }) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef<L.LayerGroup | null>(null);
  useEffect(() => {
    if (!element.current) return;
    map.current = L.map(element.current).setView(
      [order.restaurant.latitude, order.restaurant.longitude],
      14,
    );
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map.current);
    markers.current = L.layerGroup().addTo(map.current);
    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [order.id, order.restaurant.latitude, order.restaurant.longitude]);
  useEffect(() => {
    if (!map.current || !markers.current) return;
    markers.current.clearLayers();
    const points: L.LatLngTuple[] = [];
    function mark(lat: number, lng: number, label: string, color: string) {
      points.push([lat, lng]);
      L.circleMarker([lat, lng], {
        radius: 10,
        color: "#fff",
        weight: 3,
        fillColor: color,
        fillOpacity: 1,
      })
        .bindTooltip(label, { direction: "top" })
        .addTo(markers.current!);
    }
    mark(
      order.restaurant.latitude,
      order.restaurant.longitude,
      "Restoran",
      "#b73525",
    );
    if (order.destination)
      mark(
        order.destination.latitude,
        order.destination.longitude,
        "Teslimat adresi",
        "#315ca8",
      );
    if (order.location)
      mark(
        order.location.latitude,
        order.location.longitude,
        isLocationFresh(order.location.recorded_at)
          ? "Kurye"
          : "Kuryenin son konumu",
        "#176348",
      );
    map.current.fitBounds(points, { padding: [35, 35], maxZoom: 15 });
  }, [order]);
  return (
    <div
      ref={element}
      className="order-map"
      aria-label="Restoran, teslimat ve kurye konumları"
    />
  );
}
