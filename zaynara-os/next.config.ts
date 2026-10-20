import type { NextConfig } from "next";

// Sem `cacheComponents`: o hub é privado e todas as páginas dependem da sessão
// e de dados em tempo real, por isso renderizam sempre no pedido.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
