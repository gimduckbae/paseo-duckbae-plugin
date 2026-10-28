import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const stubs = {
  "@getpaseo/plugin/client": join(here, "stubs/plugin-client.tsx"),
  "@getpaseo/plugin/client/ui": join(here, "stubs/plugin-ui.tsx"),
  "@getpaseo/plugin/client/react-native": join(here, "stubs/plugin-rn.tsx"),
};
// 플러그인 폴더에도 react 등이 따로 설치돼 있어 그대로 두면 React가 두 벌 묶인다. 미리보기 쪽 한 벌로 고정.
const shared = /^(react|react-dom|react\/jsx-runtime|react-dom\/client|@tanstack\/react-query|zod)$/;

await build({
  entryPoints: [join(here, "app.tsx")],
  bundle: true,
  outfile: join(here, "dist/app.js"),
  format: "esm",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"', __DEV__: "false" },
  resolveExtensions: [".web.tsx", ".web.ts", ".tsx", ".ts", ".web.js", ".js"],
  plugins: [
    {
      name: "paseo-host-modules",
      setup(b) {
        b.onResolve({ filter: /^@getpaseo\/plugin\/client/ }, (args) => (stubs[args.path] ? { path: stubs[args.path] } : undefined));
        b.onResolve({ filter: /^@getpaseo\/plugin$/ }, () => ({ path: join(here, "../../node_modules/@getpaseo/plugin/dist/index.js") }));
        b.onResolve({ filter: shared }, (args) => ({ path: require.resolve(args.path) }));
        b.onResolve({ filter: /^react-native$/ }, () => ({ path: require.resolve("react-native-web") }));
      },
    },
  ],
});
