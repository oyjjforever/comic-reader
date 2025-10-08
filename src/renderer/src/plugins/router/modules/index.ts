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
                    title: "书架",
                    keepAlive: true
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
                children: [
                    {
                        path: 'jmtt',
                        name: "jmtt",
                        component: () => import('@renderer/views/site/jmtt.vue'),
                        meta: {
                            title: "jmtt",
                            keepAlive: true
                        }
                    }, {
                        path: 'pixiv',
                        name: "pixiv",
                        component: () => import('@renderer/views/site/pixiv.vue'),
                        meta: {
                            title: "pixiv",
                            keepAlive: true
                        }
                    }, {
                        path: 'twitter',
                        name: "twitter",
                        component: () => import('@renderer/views/site/twitter.vue'),
                        meta: {
                            title: "twitter",
                            keepAlive: true
                        }
                    },]
            }
        ],
    },
]