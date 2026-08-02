- [x] Add new headless mode setting to enable and disable certain features, for example view post, post preview, wordpress frontend lockout etc. Currently we are forcing the post preview on the user, they might not want the preview and want native preview, we currently dont have view post link override in both classic and gutenberg editor but will along side this task. On first kizlo plugin install we will ask user to enable headless mode as a recommended feature in admin banner while also allowing to choose not to. We need a complete discussion on what we should do in headless mode. Bottom line the headless mode will be a parent toggle with childs of toggles for every feature so we dont force enable everything behind one toggle allowing them to customize the experience.
- [x] Fix being able to access /wp-sitemap.xml even when wordpress frontend lockout.
- [x] Fix begin able to access secret login page by reaching /wp-admin and getting redirected to secret login page. This should be blocked because no point of hiding the login page if anybody can reach this way. 
- [] Custom fields are not getting into post and page meta.
- [] Prevent nextjs from caching previews, because preview taking twice to shaw the change.
- [] Hide kizlo preview status posts in kizlo plugin.
- [] Rename tanstack start react id by suffixing the framework eg tanstack-start-react.

# Backlog
- [] Rename the existing tanstack start template with react (Tanstack Start React) and add a separate Tanstack Start Solid. so we can provide support for both frameworks separately.
- [] Add React + Vite template like nextjs or astro with server capability because kizlo needs a server not a client application like pure react thats why i chose vite since vite provides server.