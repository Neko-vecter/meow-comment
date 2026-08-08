import { copyFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import checker from "vite-plugin-checker";
import dts from "vite-plugin-dts";

const __dirname = dirname(fileURLToPath(import.meta.url));

function getFileName(name: string, format: string) {
    if (format === "umd") return `${name}.js`;
    if (format === "cjs") return `${name}.cjs`;
    if (format === "es") return `${name}.mjs`;
    return `${name}.${format}.js`;
}

const name = "MeowCommentUI";

export default defineConfig({
    root: __dirname,
    build: {
        target: "es2015",
        outDir: resolve(__dirname, "dist"),
        minify: "terser",
        sourcemap: true,
        lib: {
            name,
            fileName: (format) => getFileName(name, format),
            entry: resolve(__dirname, "src/main.ts"),
            formats: ["es", "umd", "cjs", "iife"],
        },
        rollupOptions: {
            output: {
                assetFileNames: (assetInfo) =>
                    /\.css$/.test(assetInfo.names?.[0] ?? "")
                        ? `${name}.css`
                        : "[name].[ext]",
                exports: "named",
            },
        },
    },
    resolve: {
        tsconfigPaths: true,
        alias: {
            "@": resolve(__dirname, "src"),
            "~": resolve(__dirname),
        },
    },
    plugins: [
        {
            ...checker({ typescript: true }),
            apply: "serve",
        },
        dts({
            include: ["src"],
            exclude: ["src/**/*.{spec,test}.ts", "dist"],
            bundleTypes: true,
            compilerOptions: {
                composite: false,
            },
            afterBuild: () => {
                const dist = resolve(__dirname, "dist");
                copyFileSync(resolve(dist, "main.d.ts"), resolve(dist, "main.d.cts"));
            },
        }),
    ],
});
