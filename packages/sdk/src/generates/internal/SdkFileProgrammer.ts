import fs from "fs";
import ts from "typescript";
import { format } from "prettier";

import { INestiaConfig } from "../../INestiaConfig";
import { IRoute } from "../../structures/IRoute";
import { ImportDictionary } from "../../utils/ImportDictionary";
import { MapUtil } from "../../utils/MapUtil";
import { SdkRouteDirectory } from "./SdkRouteDirectory";
import { SdkRouteProgrammer } from "./SdkRouteProgrammer";

export namespace SdkFileProgrammer {
  /* ---------------------------------------------------------
        CONSTRUCTOR
    --------------------------------------------------------- */
  export const generate =
    (config: INestiaConfig) =>
    async (routeList: IRoute[]): Promise<void> => {
      // CONSTRUCT FOLDER TREE
      const root: SdkRouteDirectory = new SdkRouteDirectory(null, "functional");
      for (const route of routeList) emplace(root)(route);

      // ITERATE FILES
      await iterate(config)(root)(config.output + "/functional");
    };

  const emplace =
    (directory: SdkRouteDirectory) =>
    (route: IRoute): void => {
      // OPEN DIRECTORIES
      for (const key of route.accessors.slice(0, -1)) {
        directory = MapUtil.take(
          directory.children,
          key,
          () => new SdkRouteDirectory(directory, key),
        );
      }

      // ADD ROUTE
      directory.routes.push(route);
    };

  /* ---------------------------------------------------------
        FILE ITERATOR
    --------------------------------------------------------- */
  const iterate =
    (config: INestiaConfig) =>
    (directory: SdkRouteDirectory) =>
    async (outDir: string): Promise<void> => {
      // CREATE A NEW DIRECTORY
      try {
        await fs.promises.mkdir(outDir);
      } catch {}

      // ITERATE CHILDREN
      const content: string[] = [];
      for (const [key, value] of directory.children) {
        await iterate(config)(value)(`${outDir}/${key}`);
        content.push(`export * as ${key} from "./${key}";`);
      }
      if (content.length && directory.routes.length) content.push("");

      // ITERATE ROUTES
      const importer: ImportDictionary = new ImportDictionary(
        `${outDir}/index.ts`,
      );
      if (
        config.simulate === true &&
        directory.routes.some((r) => !!r.parameters.length)
      )
        importer.internal({
          file: `${config.output}/utils/NestiaSimulator.ts`,
          instance: "NestiaSimulator",
          type: false,
        });
      directory.routes.forEach((route, i) => {
        if (config.clone !== true)
          for (const tuple of route.imports)
            for (const instance of tuple[1])
              importer.internal({
                file: tuple[0],
                instance,
                type: true,
              });
        content.push(
          ts
            .createPrinter()
            .printFile(
              ts.factory.createSourceFile(
                SdkRouteProgrammer.generate(config)(importer)(route),
                ts.factory.createToken(ts.SyntaxKind.EndOfFileToken),
                ts.NodeFlags.None,
              ),
            ),
        );
        if (i !== directory.routes.length - 1) content.push("");
      });

      // FINALIZE THE CONTENT
      if (directory.routes.length !== 0)
        content.push(
          importer.toScript(outDir),
          "",
          ...content.splice(0, content.length),
        );

      const script: string =
        "/**\n" +
        " * @packageDocumentation\n" +
        ` * @module ${directory.module}\n` +
        " * @nestia Generated by Nestia - https://github.com/samchon/nestia \n" +
        " */\n" +
        "//================================================================\n" +
        content.join("\n");
      await fs.promises.writeFile(
        importer.file, 
        await format(script, { parser: "typescript" }), 
        "utf8"
      );
    };
}
