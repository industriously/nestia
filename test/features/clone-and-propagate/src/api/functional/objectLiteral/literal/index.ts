/**
 * @packageDocumentation
 * @module api.functional.objectLiteral.literal
 * @nestia Generated by Nestia - https://github.com/samchon/nestia
 */
//================================================================
import type { IConnection, IPropagation } from "@nestia/fetcher";
import { PlainFetcher } from "@nestia/fetcher/lib/PlainFetcher";
import typia from "typia";
import type { Format } from "typia/lib/tags/Format";
import type { Type } from "typia/lib/tags/Type";

/**
 * @controller ObjectLiteralController.literals
 * @path GET /objectLiteral/literal
 * @nestia Generated by Nestia - https://github.com/samchon/nestia
 */
export async function literals(
  connection: IConnection,
): Promise<literals.Output> {
  return !!connection.simulate
    ? literals.simulate(connection)
    : PlainFetcher.propagate(connection, {
        ...literals.METADATA,
        path: literals.path(),
      });
}
export namespace literals {
  export type Output = IPropagation<{
    200: {
      id: string;
      member: {
        id: string & Format<"uuid">;
        email: string & Format<"email">;
        age: number & Type<"uint32">;
      };
      created_at: string & Format<"date-time">;
    }[];
  }>;

  export const METADATA = {
    method: "GET",
    path: "/objectLiteral/literal",
    request: null,
    response: {
      type: "application/json",
      encrypted: false,
    },
    status: null,
  } as const;

  export const path = () => "/objectLiteral/literal";
  export const random = (g?: Partial<typia.IRandomGenerator>) =>
    typia.random<
      {
        id: string;
        member: {
          id: string & Format<"uuid">;
          email: string & Format<"email">;
          age: number & Type<"uint32">;
        };
        created_at: string & Format<"date-time">;
      }[]
    >(g);
  export const simulate = (connection: IConnection): Output => {
    return {
      success: true,
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
      data: random(
        "object" === typeof connection.simulate && null !== connection.simulate
          ? connection.simulate
          : undefined,
      ),
    };
  };
}
