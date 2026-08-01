# Today
- [x] Fix page preview in kizlo plugin getting {"success":false,"data":"Failed to preview."}.
- [x] Preview fails when a page is not build with dynamic segment meaning the page slug is not dynamic eg instead of [slug] its some-page. In this case the preview breaks since we create the preview link like this: http://localhost:3000/2-2?preview_token=eyJwYXlsb2FkIjp7ImlkIjo5LCJwYXJlbnQiOjIsImV4cGlyZXMiOjE3ODU1NDYxOTZ9LCJoYXNoIjoiZmE2ZThlN2Y1ZDU5ZmEzMTc2N2E3YWFlZTQ0Yjc1NmZiNTQ3NmZmYjQ1NDk4MTY0ZGRiNjRmZmY3OGY2YjE0OCJ9, the id does not match with the static slug and page becomes not found. Can we changed the id to slug? 
- [x] Fix gutenberg preview in kizlo plugin, our existing preview solution not working in the gutenberg editor.
- [] Rename tanstack start react id by suffixing the framework eg tanstack-start-react.
- [] Custom fields are not getting into post and page meta.

# Backlog
- [] Rename the existing tanstack start template with react (Tanstack Start React) and add a separate Tanstack Start Solid. so we can provide support for both frameworks separately.
- [] Add React + Vite template like nextjs or astro with server capability because kizlo needs a server not a client application like pure react thats why i chose vite since vite provides server.