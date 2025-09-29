export default [
    {
        path: '/',
        // component: layout,
        children: [
            {
                path: '/',
                name: "home",
                component: () => import('@renderer/views/comic-book/index.vue'),
                meta: {
                    title: "书架"
                }
            },
            {
                path: '/book',
                name: "book.read",
                component: () => import('@renderer/views/comic-book/reader.vue'),
            }
        ],
    },
]