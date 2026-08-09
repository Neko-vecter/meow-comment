# Meow comment

一个轻量级的单向评论收集系统，支持通过 RSS 订阅收到的评论。

A lightweight, one-way comment collection system with RSS feed support.

前端部分参考 [Artalk](https://github.com/ArtalkJS/Artalk)

## File layout

### [Backend](./backend/)

构建 deb 包

```shell
bash ./backend/deploy/build.sh
```

### component package

[meow-comment-ui](./package/meow-comment-ui/)

### Example site

使用 vite 构建的简单示例。需要先构建 [meow-comment-ui](./package/meow-comment-ui/)。

[Example site](./frontend/)

## Reference

- [API Docs](./docs/api.md)
- [Config](./docs/config.md)
