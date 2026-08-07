# API

## 获取验证码

### `GET /api/verification`

响应参数：

```json
{
    "uuid": "验证码 UUID",
    "captcha_base64": "验证码图片 Base64"
}
```

## 提交评论

### `POST /api/comment`

请求头：

```http
Content-Type: application/json
Origin: https://blog.xxx.com
```

请求参数：

```json
{
    "username": "username",
    "email": "email",
    "comments": "comments",
    "source_path": "/page/xxx",
    "page_title": "页面标题",
    "verification_uuid": "验证码 UUID",
    "verification_code": "用户输入的验证码"
}
```

服务端校验：

- `Origin` / `Referer` 必须来自允许的网站，例如 `blog.xxx.com`。
- email 格式检查
- 校验验证码 UUID 和验证码内容。

服务端留存：

- `user_agent`
- `ip_address`
- `origin`
- `referer`

## RSS

### `GET /api/rss?token=rss_token`

请求示例：

```http
GET /api/rss?token=rss_token HTTP/1.1
Accept: application/rss+xml
```

响应示例：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
    <channel>
        <title>Meow Comment RSS</title>
        <link>https://site_url</link>
        <description>Meow</description>
        <item>
            <title>username | 页面标题</title>
            <pubDate>评论日期 UTC 时区</pubDate>
            <description><![CDATA[
                /page/xxx
                <br />
                username | username@example.com
                <br />
                评论主体内容
            ]]></description>
        </item>
    </channel>
</rss>
```
