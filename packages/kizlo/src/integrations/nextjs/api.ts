/** Map framework route methods to Kizlo without passing Next.js params as platform context. */
export function toNextJsHandler(handler: (request: Request) => Response | Promise<Response>) {
	const route = (request: Request) => handler(request)
	return { GET: route, POST: route, PUT: route, PATCH: route, DELETE: route, OPTIONS: route, HEAD: route }
}
