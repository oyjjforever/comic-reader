export default [
    {
        path: '/',
        // component: layout,
        children: [
            {
                path: '/',
                name: "book",
                component: () => import('@renderer/views/book/index.vue'),
                meta: {
                    title: "书架"
                }
            },
            {
                path: '/book',
                name: "book.read",
                component: () => import('@renderer/views/book/reader.vue'),
            },
            {
                path: '/setting',
                name: "setting",
                component: () => import('@renderer/views/setting/index.vue'),
            },
            {
                path: '/video',
                name: "video",
                component: () => import('@renderer/views/video/index.vue'),
            },
            {
                path: '/video/player',
                name: "video.play",
                component: () => import('@renderer/views/video/player.vue'),
            },
            {
                path: '/site',
                name: "site",
                component: () => import('@renderer/views/site/index.vue'),
            }
        ],
    },
]