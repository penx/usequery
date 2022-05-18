import { useState, useRef, useMemo, useCallback } from "react";
import { equal } from "@wry/equality";

export type Variables = Record<string, any>;

const useMemoWhenEqual = <T>(value: T) => {
  const ref = useRef(value);
  if (!equal(ref.current, value)) {
    ref.current = value;
  }
  return ref.current;
};

export interface QueryOptions<TData> {
  skip?: boolean;
  onCompleted?: (data: TData) => void;
  onError?: (error: any) => void;
}

export interface QueryOptionsWithVariables<TData, TVariables extends Variables>
  extends QueryOptions<TData> {
  variables: TVariables;
}

export type BaseQueryResult<TData> = {
  loading: boolean;
  error: any;
  data: TData | null;
  previousData: TData | null;
};

export interface QueryResult<TData, TVariables extends Variables = Variables>
  extends BaseQueryResult<TData> {
  refetch: (
    variables?: Partial<TVariables> | undefined
  ) => Promise<QueryResult<TData, TVariables>>;
}

/**
 * Mirrors the functionality of
 * [Apollo's useQuery hook](https://www.apollographql.com/docs/react/data/queries/#usequery-api),
 * but with a "query" being any async function rather than GQL statement.
 */
function useQuery<TData>(
  query: () => Promise<TData>,
  options?: QueryOptions<TData>
): QueryResult<TData, never>;
function useQuery<TData, TVariables extends Variables>(
  query: (variables: TVariables) => Promise<TData>,
  options: QueryOptionsWithVariables<TData, TVariables>
): QueryResult<TData, TVariables>;
function useQuery<TData, TVariables extends Variables>(
  query: (variables?: TVariables) => Promise<TData>,
  options?: QueryOptionsWithVariables<TData, TVariables> | QueryOptions<TData>
): QueryResult<TData, TVariables> {
  const { skip, onCompleted, onError } = options || {};

  const data = useRef<TData | null>(null);
  const previousData = useRef<TData | null>(null);
  const loading = useRef<boolean>(!skip);
  const error = useRef<any>(null);
  const cancelLast = useRef<() => void>();
  const [, forceUpdate] = useState(0);
  const passedVariables =
    options && "variables" in options ? options.variables : undefined;
  const variables = useMemoWhenEqual(passedVariables);

  const fetch: (
    refetchVariables?: Partial<TVariables> | undefined
  ) => Promise<QueryResult<TData, TVariables>> = useCallback(
    async (refetchVariables: Partial<TVariables> | undefined) => {
      const mergedVariables = refetchVariables
        ? Object.assign({}, variables, refetchVariables)
        : variables;
      cancelLast.current?.();
      let isLatest = true;
      previousData.current = data.current;
      data.current = null;
      loading.current = true;
      error.current = null;
      cancelLast.current = () => {
        isLatest = false;
      };
      return query(...(mergedVariables ? [mergedVariables] : []))
        .then((response) => {
          if (isLatest) {
            data.current = response;
            loading.current = false;
            error.current = null;
            forceUpdate((x) => x + 1);
            onCompleted?.(response);
          }
          return {
            loading: loading.current,
            error: error.current,
            data: data.current,
            previousData: previousData.current,
            refetch: fetch,
          };
        })
        .catch((e) => {
          if (isLatest) {
            loading.current = false;
            error.current = e;
            forceUpdate((x) => x + 1);
            onError?.(e);
          }
          throw e;
        });
    },
    [query, variables, onCompleted, onError]
  );

  useMemo(async () => {
    if (!skip) {
      try {
        await fetch();
      } catch (e) {}
    }
  }, [fetch, skip]);

  const refetch = useCallback(
    (refetchVariables?: Partial<TVariables> | undefined) => {
      const result = fetch(refetchVariables);
      forceUpdate((x) => x + 1);
      return result;
    },
    [fetch]
  );

  return {
    loading: loading.current,
    error: error.current,
    data: data.current,
    previousData: previousData.current,
    refetch,
  };
}

export { useQuery };
