# Meow comment

一个轻量级的单向评论收集系统，支持通过 RSS 订阅收到的评论。

A lightweight, one-way comment collection system with RSS feed support.

前端 Component 参考 [Artalk](https://github.com/ArtalkJS/Artalk)

## Add package

```shell
yarn add @neko_vecter/meow-comment-ui
```

## File layout

### Backend

[Backend](./backend/)

构建 deb 包

```shell
bash ./backend/deploy/build.sh
```

### Frontend

[frontend](./frontend/)

构建 frontend

```shell
cd ./frontend
yarn build
```

### component package

[meow-comment-ui](./package/meow-comment-ui/)

组件调试

```shell
cd ./package/meow-comment-ui
yarn dev
```

## Reference

- [API Docs](./docs/api.md)
- [Config](./docs/config.md)
