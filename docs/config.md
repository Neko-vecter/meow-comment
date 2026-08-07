# Config

配置文件使用 JSON：

```json
{
  "listen": "127.0.0.1:8080",
  "db_path": "./data/comments.db",
  "proxy_ip_header": "X-Forwarded-For",
  "rss_title": "Meow Comment RSS",
  "rss_link": "https://comment.xxx.com",
  "captcha_enabled": true,
  "allowed_sites_enabled": true,
  "allowed_sites": [
    "https://blog.xxx.com"
  ]
}
```

`proxy_ip_header` 用于指定代理转发客户端 IP 的请求标头，默认值为 `X-Forwarded-For`，也可以配置为其他标头名称。

## 启动服务

```bash
meow-comment serve --config config.json
```

## RSS Token

创建 token。程序会要求输入 key 名称，并只显示一次明文 token：

```bash
meow-comment token create --config config.json
```

也可以直接传入 key 名称：

```bash
meow-comment token create --config config.json --name blog
```

通过 key 名称删除：

```bash
meow-comment token delete --config config.json --name blog
```

通过 token ID 删除：

```bash
meow-comment token delete --config config.json --id TOKEN_ID
```

RSS token 只保存 SHA-256 摘要，不保存明文。

## 日志

服务日志输出到标准输出，包含：

- 配置加载和服务启动
- HTTP 请求路径、状态码和耗时
- 监听错误
- 服务关闭信号和关闭结果

日志不会输出请求体或 RSS token。
