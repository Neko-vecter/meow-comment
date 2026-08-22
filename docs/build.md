# build

## backend

require package

- git
- golang-go
- dpkg
- coreutils

```sh
bash ./backend/deploy/build.sh
```

## frontend package

require package

- nodejs v24 - v26
- corepack
- yarn v4

```sh
cd ./package/meow-comment-ui
yarn install
npm pack
```
