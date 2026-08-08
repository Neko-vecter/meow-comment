# Config

配置文件使用 JSON：

> [!note]
> 默认配置文件位置 `/opt/meow-comment/config.json`

```json
{
    "listen": "127.0.0.1:9100",
    "db_path": "/var/lib/meow-comment/comments.db",
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

```shell
/opt/meow-comment/meow-comment serve --config /opt/meow-comment/config.json
```

## RSS Token

> [!note]
> 创建 token 需要在 systemd service 停止的状态下进行。
>
> 后续会修复这个问题

创建 token。程序会要求输入 key 名称，并只显示一次明文 token：

```shell
meow-comment token create --config config.json
```

也可以直接传入 key 名称：

```shell
meow-comment token create --config config.json --name blog
```

通过 key 名称删除：

```shell
meow-comment token delete --config config.json --name blog
```

通过 token ID 删除：

```shell
meow-comment token delete --config config.json --id TOKEN_ID
```

RSS token 只保存 SHA-256 摘要，不保存明文。
