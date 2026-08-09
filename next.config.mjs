const repo = "prompt-library";
const isGithubActions = process.env.GITHUB_ACTIONS === "true";
const basePath = isGithubActions ? `/${repo}` : "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  poweredByHeader: false,
  images: { unoptimized: true },
  basePath,
  assetPrefix: basePath ? `${basePath}/` : undefined,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    // Target for "publish to the shared library" — the repo whose issue tracker
    // receives submissions and whose workflow ingests them.
    NEXT_PUBLIC_REPO_SLUG: process.env.NEXT_PUBLIC_REPO_SLUG || "jnibarger01/prompt-library",
  },
};

export default nextConfig;
