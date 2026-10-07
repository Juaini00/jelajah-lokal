import { QueryClient, useQuery, type QueryClient as Client } from '@tanstack/react-query'
import { api, isApiError } from './api'
import type { Article, Author, Category, Media, Usage } from './types'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      // Only transient failures (network, 5xx) are retried; auth/permission/not-found are final.
      retry: (failures, error) => failures < 2 && isApiError(error) && error.retryable,
      refetchOnWindowFocus: true,
    },
    mutations: { retry: false },
  },
})

export const keys = {
  articles: ['articles'] as const,
  article: (id: string) => ['articles', id] as const,
  categories: ['categories'] as const,
  authors: ['authors'] as const,
  media: ['media'] as const,
  editorial: ['editorial'] as const,
  editorialDrafts: ['editorial', 'articles'] as const,
  usage: ['editorial', 'usage'] as const,
}

const list = <T>(path: string) => ({ signal }: { signal: AbortSignal }) => api.get<{ data: T[] }>(path, signal).then(r => r.data)

export const useArticles = () => useQuery({ queryKey: keys.articles, queryFn: list<Article>('/articles') })
export const useCategories = () => useQuery({ queryKey: keys.categories, queryFn: list<Category>('/categories'), staleTime: 5 * 60_000 })
export const useAuthors = () => useQuery({ queryKey: keys.authors, queryFn: list<Author>('/authors'), staleTime: 5 * 60_000 })
export const useMedia = () => useQuery({ queryKey: keys.media, queryFn: list<Media>('/media'), staleTime: 5 * 60_000 })
export const useEditorialDrafts = () => useQuery({ queryKey: keys.editorialDrafts, queryFn: list<Article>('/editorial/articles') })

export const useArticle = (id: string) => useQuery({
  queryKey: keys.article(id),
  queryFn: ({ signal }) => api.get<{ data: Article }>(`/articles/${id}`, signal).then(r => r.data),
  // Seed from the list so the editor paints instantly; the detail fetch then confirms the revision.
  initialData: () => queryClient.getQueryData<Article[]>(keys.articles)?.find(a => a.documentId === id),
  initialDataUpdatedAt: () => queryClient.getQueryState(keys.articles)?.dataUpdatedAt,
  staleTime: 0,
})

export const useUsage = () => useQuery({
  queryKey: keys.usage,
  queryFn: ({ signal }) => api.get<Usage>('/editorial/usage', signal),
  // While another AI process holds the lease, poll so the button re-enables on its own.
  refetchInterval: query => (query.state.data?.busy ? 5_000 : false),
})

/** Write a server-confirmed article into detail + list caches without refetching. */
export function storeArticle(client: Client, article: Article) {
  client.setQueryData(keys.article(article.documentId), article)
  client.setQueryData<Article[]>(keys.articles, current => {
    if (!current) return current
    const rest = current.filter(a => a.documentId !== article.documentId)
    return [article, ...rest].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  })
  void client.invalidateQueries({ queryKey: keys.editorial })
}

export function dropArticle(client: Client, id: string) {
  client.removeQueries({ queryKey: keys.article(id), exact: true })
  client.setQueryData<Article[]>(keys.articles, current => current?.filter(a => a.documentId !== id))
  void client.invalidateQueries({ queryKey: keys.editorial })
}

/** Upsert/remove by documentId in a cached collection. */
export function upsertIn<T extends { documentId: string }>(client: Client, key: readonly unknown[], item: T, prepend = false) {
  client.setQueryData<T[]>(key, current => {
    if (!current) return current
    if (!current.some(x => x.documentId === item.documentId)) return prepend ? [item, ...current] : [...current, item]
    return current.map(x => (x.documentId === item.documentId ? item : x))
  })
}
export function removeFrom(client: Client, key: readonly unknown[], id: string) {
  client.setQueryData<{ documentId: string }[]>(key, current => current?.filter(x => x.documentId !== id))
}
