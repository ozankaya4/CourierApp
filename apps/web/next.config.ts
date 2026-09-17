import type { NextConfig } from "next";
const config: NextConfig = {
  agentRules: false,
  transpilePackages: ["@courier/core", "@courier/client"],
  poweredByHeader: false,
};
export default config;
