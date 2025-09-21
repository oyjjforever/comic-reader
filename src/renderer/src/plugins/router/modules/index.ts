export default [
    {
        path: '/',
        // component: layout,
        children: [
            {
                path: '/',
                name: "home",
                component: () => import('@renderer/pages/home.vue'),
                meta: {
                    title: "书架"
                }
            },
            {
                path: '/book',
                name: "book.read",
                component: () => import('@renderer/pages/read.vue'),
            }
        ],
    },
]