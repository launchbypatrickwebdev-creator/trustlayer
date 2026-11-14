import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: {
    // Pin root so parent C:\Users\DvinciProjects package-lock is ignored
    root: path.join(__dirname),
  },
};

export default nextConfig;