import { QueryClient } from "@tanstack/react-query"

export function createQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
				staleTime: 60 * 1000,
				gcTime: 30 * 60 * 1000,
				refetchOnMount: false,
				refetchOnWindowFocus: "always",
				refetchOnReconnect: "always",
				refetchInterval: 60 * 1000,
				refetchIntervalInBackground: false,
			},
		},
	})
}
