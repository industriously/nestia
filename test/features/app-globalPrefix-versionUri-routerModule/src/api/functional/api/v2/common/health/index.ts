/**
 * @packageDocumentation
 * @module api.functional.api.v2.common.health
 * @nestia Generated by Nestia - https://github.com/samchon/nestia
 */
//================================================================
import type { IConnection } from "@nestia/fetcher";
import { PlainFetcher } from "@nestia/fetcher/lib/PlainFetcher";

/**
 * @controller HealthController.get
 * @path GET /api/v2/common/health
 * @nestia Generated by Nestia - https://github.com/samchon/nestia
 */
export async function get(connection: IConnection): Promise<void> {
  return PlainFetcher.fetch(connection, {
    ...get.METADATA,
    path: get.path(),
  });
}
export namespace get {
  export const METADATA = {
    method: "GET",
    path: "/api/v2/common/health",
    request: null,
    response: {
      type: "application/json",
      encrypted: false,
    },
    status: null,
  } as const;
  export const path = () => "/api/v2/common/health";
}
