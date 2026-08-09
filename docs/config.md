# Config

配置文件使用 JSON：

> [!note]
> 默认配置文件位置 `/opt/meow-comment/config.json`

```json
{
    "listen": "127.0.0.1:9100",
    "admin_listen": "127.0.0.1:9101",
    "admin_key_file": "/var/lib/meow-comment/admin.key",
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

## 启动服务

```shell
/opt/meow-comment/meow-comment serve --config /opt/meow-comment/config.json
```

## RSS Token

创建 token

```shell
sudo meow-commentctl token create \
    --config /opt/meow-comment/config.json \
    --name blog
```

列出当前所有 RSS token

```shell
sudo meow-commentctl token list \
    --config /opt/meow-comment/config.json
```

删除 token

```shell
sudo meow-commentctl token delete \
    --config /opt/meow-comment/config.json \
    --name blog
```

也可以通过 token ID 删除

```shell
sudo meow-commentctl token delete \
    --config /opt/meow-comment/config.json \
    --id TOKEN_ID
```

RSS token 只保存 SHA-256 摘要，不保存明文。
