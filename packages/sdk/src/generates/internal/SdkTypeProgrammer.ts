import ts from "typescript";
import { IJsDocTagInfo } from "typia";
import { ExpressionFactory } from "typia/lib/factories/ExpressionFactory";
import { TypeFactory } from "typia/lib/factories/TypeFactory";
import { IMetadataTypeTag } from "typia/lib/schemas/metadata/IMetadataTypeTag";
import { Metadata } from "typia/lib/schemas/metadata/Metadata";
import { MetadataAlias } from "typia/lib/schemas/metadata/MetadataAlias";
import { MetadataArray } from "typia/lib/schemas/metadata/MetadataArray";
import { MetadataAtomic } from "typia/lib/schemas/metadata/MetadataAtomic";
import { MetadataEscaped } from "typia/lib/schemas/metadata/MetadataEscaped";
import { MetadataObject } from "typia/lib/schemas/metadata/MetadataObject";
import { MetadataProperty } from "typia/lib/schemas/metadata/MetadataProperty";
import { MetadataTuple } from "typia/lib/schemas/metadata/MetadataTuple";
import { Escaper } from "typia/lib/utils/Escaper";

import { INestiaConfig } from "../../INestiaConfig";
import { FilePrinter } from "./FilePrinter";
import { ImportDictionary } from "./ImportDictionary";

export namespace SdkTypeProgrammer {
  /* -----------------------------------------------------------
    FACADE
  ----------------------------------------------------------- */
  export const write =
    (config: INestiaConfig) =>
    (importer: ImportDictionary) =>
    (meta: Metadata, parentEscaped: boolean = false): ts.TypeNode => {
      const union: ts.TypeNode[] = [];

      // COALESCES
      if (meta.any) union.push(TypeFactory.keyword("any"));
      if (meta.nullable) union.push(writeNode("null"));
      if (meta.isRequired() === false) union.push(writeNode("undefined"));
      if (parentEscaped === false && meta.escaped)
        union.push(write_escaped(config)(importer)(meta.escaped));

      // ATOMIC TYPES
      for (const c of meta.constants)
        for (const value of c.values) union.push(write_constant(value));
      for (const tpl of meta.templates)
        union.push(write_template(config)(importer)(tpl));
      for (const atom of meta.atomics) union.push(write_atomic(importer)(atom));

      // OBJECT TYPES
      for (const tuple of meta.tuples)
        union.push(write_tuple(config)(importer)(tuple));
      for (const array of meta.arrays)
        union.push(write_array(config)(importer)(array));
      for (const object of meta.objects)
        if (
          object.name === "__type" ||
          object.name.startsWith("__type.") ||
          object.name === "__object" ||
          object.name.startsWith("__object.")
        )
          union.push(write_object(config)(importer)(object));
        else union.push(write_alias(config)(importer)(object));
      for (const alias of meta.aliases)
        union.push(write_alias(config)(importer)(alias));

      return union.length === 1
        ? union[0]
        : ts.factory.createUnionTypeNode(union);
    };

  export const write_object =
    (config: INestiaConfig) =>
    (importer: ImportDictionary) =>
    (object: MetadataObject): ts.TypeNode => {
      const regular = object.properties.filter((p) => p.key.isSoleLiteral());
      const dynamic = object.properties.filter((p) => !p.key.isSoleLiteral());
      return FilePrinter.description(
        regular.length && dynamic.length
          ? ts.factory.createIntersectionTypeNode([
              write_regular_property(config)(importer)(regular),
              ...dynamic.map(write_dynamic_property(config)(importer)),
            ])
          : dynamic.length
            ? ts.factory.createIntersectionTypeNode(
                dynamic.map(write_dynamic_property(config)(importer)),
              )
            : write_regular_property(config)(importer)(regular),
        writeComment([])(object.description ?? null, object.jsDocTags),
      );
    };

  const write_escaped =
    (config: INestiaConfig) =>
    (importer: ImportDictionary) =>
    (meta: MetadataEscaped): ts.TypeNode => {
      if (
        meta.original.size() === 1 &&
        meta.original.natives.length === 1 &&
        meta.original.natives[0] === "Date"
      )
        return ts.factory.createIntersectionTypeNode([
          TypeFactory.keyword("string"),
          writeTag(importer)({
            name: "Format",
            value: "date-time",
          } as IMetadataTypeTag),
        ]);
      return write(config)(importer)(meta.returns, true);
    };

  /* -----------------------------------------------------------
    ATOMICS
  ----------------------------------------------------------- */
  const write_constant = (value: boolean | bigint | number | string) => {
    if (typeof value === "boolean")
      return ts.factory.createLiteralTypeNode(
        value ? ts.factory.createTrue() : ts.factory.createFalse(),
      );
    else if (typeof value === "bigint")
      return ts.factory.createLiteralTypeNode(
        value < BigInt(0)
          ? ts.factory.createPrefixUnaryExpression(
              ts.SyntaxKind.MinusToken,
              ts.factory.createBigIntLiteral((-value).toString()),
            )
          : ts.factory.createBigIntLiteral(value.toString()),
      );
    else if (typeof value === "number")
      return ts.factory.createLiteralTypeNode(ExpressionFactory.number(value));
    return ts.factory.createLiteralTypeNode(
      ts.factory.createStringLiteral(value),
    );
  };

  const write_template =
    (config: INestiaConfig) =>
    (importer: ImportDictionary) =>
    (meta: Metadata[]): ts.TypeNode => {
      const head: boolean = meta[0].isSoleLiteral();
      const spans: [ts.TypeNode | null, string | null][] = [];
      for (const elem of meta.slice(head ? 1 : 0)) {
        const last =
          spans.at(-1) ??
          (() => {
            const tuple = [null!, null!] as [ts.TypeNode | null, string | null];
            spans.push(tuple);
            return tuple;
          })();
        if (elem.isSoleLiteral())
          if (last[1] === null) last[1] = String(elem.constants[0].values[0]);
          else
            spans.push([
              ts.factory.createLiteralTypeNode(
                ts.factory.createStringLiteral(
                  String(elem.constants[0].values[0]),
                ),
              ),
              null,
            ]);
        else if (last[0] === null) last[0] = write(config)(importer)(elem);
        else spans.push([write(config)(importer)(elem), null]);
      }
      return ts.factory.createTemplateLiteralType(
        ts.factory.createTemplateHead(
          head ? (meta[0].constants[0].values[0] as string) : "",
        ),
        spans
          .filter(([node]) => node !== null)
          .map(([node, str], i, array) =>
            ts.factory.createTemplateLiteralTypeSpan(
              node!,
              (i !== array.length - 1
                ? ts.factory.createTemplateMiddle
                : ts.factory.createTemplateTail)(str ?? ""),
            ),
          ),
      );
    };

  const write_atomic =
    (importer: ImportDictionary) =>
    (meta: MetadataAtomic): ts.TypeNode =>
      write_type_tag_matrix(importer)(
        ts.factory.createKeywordTypeNode(
          meta.type === "boolean"
            ? ts.SyntaxKind.BooleanKeyword
            : meta.type === "bigint"
              ? ts.SyntaxKind.BigIntKeyword
              : meta.type === "number"
                ? ts.SyntaxKind.NumberKeyword
                : ts.SyntaxKind.StringKeyword,
        ),
        meta.tags,
      );

  /* -----------------------------------------------------------
    INSTANCES
  ----------------------------------------------------------- */
  const write_array =
    (config: INestiaConfig) =>
    (importer: ImportDictionary) =>
    (meta: MetadataArray): ts.TypeNode =>
      write_type_tag_matrix(importer)(
        ts.factory.createArrayTypeNode(
          write(config)(importer)(meta.type.value),
        ),
        meta.tags,
      );

  const write_tuple =
    (config: INestiaConfig) =>
    (importer: ImportDictionary) =>
    (meta: MetadataTuple): ts.TypeNode =>
      ts.factory.createTupleTypeNode(
        meta.type.elements.map((elem) =>
          elem.rest
            ? ts.factory.createRestTypeNode(
                ts.factory.createArrayTypeNode(
                  write(config)(importer)(elem.rest),
                ),
              )
            : elem.optional
              ? ts.factory.createOptionalTypeNode(write(config)(importer)(elem))
              : write(config)(importer)(elem),
        ),
      );

  const write_regular_property =
    (config: INestiaConfig) =>
    (importer: ImportDictionary) =>
    (properties: MetadataProperty[]): ts.TypeLiteralNode =>
      ts.factory.createTypeLiteralNode(
        properties.map((p) =>
          FilePrinter.description(
            ts.factory.createPropertySignature(
              undefined,
              Escaper.variable(String(p.key.constants[0].values[0]))
                ? ts.factory.createIdentifier(
                    String(p.key.constants[0].values[0]),
                  )
                : ts.factory.createStringLiteral(
                    String(p.key.constants[0].values[0]),
                  ),
              p.value.isRequired() === false
                ? ts.factory.createToken(ts.SyntaxKind.QuestionToken)
                : undefined,
              SdkTypeProgrammer.write(config)(importer)(p.value),
            ),
            writeComment(p.value.atomics)(p.description, p.jsDocTags),
          ),
        ),
      );

  const write_dynamic_property =
    (config: INestiaConfig) =>
    (importer: ImportDictionary) =>
    (property: MetadataProperty): ts.TypeLiteralNode =>
      ts.factory.createTypeLiteralNode([
        FilePrinter.description(
          ts.factory.createIndexSignature(
            undefined,
            [
              ts.factory.createParameterDeclaration(
                undefined,
                undefined,
                ts.factory.createIdentifier("key"),
                undefined,
                SdkTypeProgrammer.write(config)(importer)(property.key),
              ),
            ],
            SdkTypeProgrammer.write(config)(importer)(property.value),
          ),
          writeComment(property.value.atomics)(
            property.description,
            property.jsDocTags,
          ),
        ),
      ]);

  const write_alias =
    (config: INestiaConfig) =>
    (importer: ImportDictionary) =>
    (meta: MetadataAlias | MetadataObject): ts.TypeNode => {
      importInternalFile(config)(importer)(meta.name);
      return ts.factory.createTypeReferenceNode(meta.name);
    };

  /* -----------------------------------------------------------
    MISCELLANEOUS
  ----------------------------------------------------------- */
  const write_type_tag_matrix =
    (importer: ImportDictionary) =>
    (base: ts.TypeNode, matrix: IMetadataTypeTag[][]): ts.TypeNode => {
      matrix = matrix.filter((row) => row.length !== 0);
      if (matrix.length === 0) return base;
      else if (matrix.length === 1)
        return ts.factory.createIntersectionTypeNode([
          base,
          ...matrix[0].map((tag) => writeTag(importer)(tag)),
        ]);
      return ts.factory.createIntersectionTypeNode([
        base,
        ts.factory.createUnionTypeNode(
          matrix.map((row) =>
            row.length === 1
              ? writeTag(importer)(row[0])
              : ts.factory.createIntersectionTypeNode(
                  row.map((tag) => writeTag(importer)(tag)),
                ),
          ),
        ),
      ]);
    };
}

const writeNode = (text: string) => ts.factory.createTypeReferenceNode(text);
const writeTag = (importer: ImportDictionary) => (tag: IMetadataTypeTag) => {
  const instance: string = tag.name.split("<")[0];
  return ts.factory.createTypeReferenceNode(
    importer.external({
      type: true,
      library: `typia/lib/tags/${instance}`,
      instance,
    }),
    [
      ts.factory.createLiteralTypeNode(
        typeof tag.value === "boolean"
          ? tag.value
            ? ts.factory.createTrue()
            : ts.factory.createFalse()
          : typeof tag.value === "bigint"
            ? tag.value < BigInt(0)
              ? ts.factory.createPrefixUnaryExpression(
                  ts.SyntaxKind.MinusToken,
                  ts.factory.createBigIntLiteral((-tag.value).toString()),
                )
              : ts.factory.createBigIntLiteral(tag.value.toString())
            : typeof tag.value === "number"
              ? ExpressionFactory.number(tag.value)
              : ts.factory.createStringLiteral(tag.value),
      ),
    ],
  );
};
const writeComment =
  (atomics: MetadataAtomic[]) =>
  (description: string | null, jsDocTags: IJsDocTagInfo[]): string => {
    const lines: string[] = [];
    if (description?.length)
      lines.push(...description.split("\n").map((s) => `${s}`));

    const filtered: IJsDocTagInfo[] =
      !!atomics.length && !!jsDocTags?.length
        ? jsDocTags.filter(
            (tag) =>
              !atomics.some((a) =>
                a.tags.some((r) => r.some((t) => t.kind === tag.name)),
              ),
          )
        : jsDocTags ?? [];

    if (description?.length && filtered.length) lines.push("");
    if (filtered.length)
      lines.push(
        ...filtered.map((t) =>
          t.text?.length
            ? `@${t.name} ${t.text.map((e) => e.text).join("")}`
            : `@${t.name}`,
        ),
      );
    return lines.join("\n");
  };

const importInternalFile =
  (config: INestiaConfig) => (importer: ImportDictionary) => (name: string) => {
    const top = name.split(".")[0];
    if (importer.file === `${config.output}/structures/${top}.ts`) return;
    importer.internal({
      type: true,
      file: `${config.output}/structures/${name.split(".")[0]}`,
      instance: top,
    });
  };
