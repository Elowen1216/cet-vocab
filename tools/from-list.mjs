name: 生成词表与发音

on:
  workflow_dispatch:
    inputs:
      limit:
        description: '只处理前 N 个词（留空=全部）'
        required: false
        default: ''

permissions:
  contents: write

jobs:
  build:
    runs-on: ubuntu-latest
    env:
      LIMIT: ${{ inputs.limit }}
    steps:
      - uses: actions/checkout@v4

      - name: 0) 设置 git
        run: |
          git config user.name github-actions
          git config user.email actions@github.com

      - name: 1) 词表 -> words.json
        run: node tools/from-list.mjs data/my-words.txt

      - name: 1.5) 提交
        run: |
          git add -A
          git commit -m "生成 words.json" || echo "没有变化"
          git pull --rebase --autostash || true
          git push || echo "推送失败"

      - name: 2) 补英文释义与例句
        run: node tools/enrich.mjs data/words.json

      - name: 2.5) 提交
        run: |
          git add -A
          git commit -m "英文释义与例句" || echo "没有变化"
          git pull --rebase --autostash || true
          git push || echo "推送失败"

      - name: 3) 抓真人发音
        run: node tools/fetch-audio.mjs data/words.json

      - name: 4) 提交回仓库
        run: |
          git add -A
          git commit -m "真人发音" || echo "没有变化"
          git pull --rebase --autostash || true
          git push || echo "推送失败"
