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
                    }, {
                        path: 'weibo',
                        name: "weibo",
                        component: () => import('@renderer/views/site/weibo.vue'),
                        meta: {
                            title: "weibo",
                            keepAlive: true
                        }
                    }, {
                        path: 'pornhub',
                        name: "pornhub",
                        component: () => import('@renderer/views/site/pornhub.vue'),
                        meta: {
                            title: "pornhub",
                            keepAlive: true
                        }
                    }]
            }
        ],
    },
]