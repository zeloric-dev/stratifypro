/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  // The engine and resolver are workspace TypeScript packages consumed as
  // source, so they build with the app rather than needing a publish step.
  transpilePackages: ['@stratifypro/engine', '@stratifypro/resolve'],
};
