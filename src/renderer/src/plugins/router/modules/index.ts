export default [
    {
        path: '/',
        component: () => import('@renderer/layout/index.vue'),
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
                name: "reader",
                component: () => import('@renderer/views/reader/index.vue'),
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
                path: '/special-attention',
                name: "special-attention",
                component: () => import('@renderer/views/special-attention/index.vue'),
                meta: {
                    title: "特别关注",
                    keepAlive: true
                }
            },
            {
                path: '/search',
                name: "search",
                component: () => import('@renderer/views/search/index.vue'),
                meta: {
                    title: "搜索",
                    keepAlive: true
                }
            },
            {
                path: '/site',
                name: "site",
                children: [
                    {
                        path: ':site',
                        name: "site-view",
                        component: () => import('@renderer/views/site/index.vue'),
                        meta: {
                            keepAlive: true
                        }
                    },
                    {
                        path: 'yfantasy',
                        name: "yfantasy",
                        component: () => import('@renderer/views/site/yfantasy.vue'),
                        meta: {
                            title: "yfantasy",
                            keepAlive: true
                        }
                    },
                    {
                        path: '4khd',
                        name: "4khd",
                        component: () => import('@renderer/views/site/4khd.vue'),
                        meta: {
                            title: "4khd",
                            keepAlive: true
                        }
                    },
                    {
                        path: 'missav',
                        name: "missav",
                        component: () => import('@renderer/views/site/missav.vue'),
                        meta: {
                            title: "missav",
                            keepAlive: true
                        }
                    },
                ]
            }
        ],
    },
    {
        path: '/popup',
        component: () => import('@renderer/layout/popup-window.vue'),
        children: [
            {
                path: 'search',
                name: 'popup-search',
                component: () => import('@renderer/views/search/index.vue'),
                meta: {
                    title: "剪切板弹窗",
                    isPopup: true
                }
            }
        ]
    }
]