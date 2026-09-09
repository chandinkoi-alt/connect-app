FROM node:20-bookworm-slim

# 技能実習計画認定申請書：実物Word様式へのデータ書き込み（python-docx）と
# PDF変換（LibreOffice headless）に必要なパッケージ。
# fonts-ipafont-* は様式内の日本語（ゴシック体・明朝体）を正しく描画するために必須。
# python-docxはpipではなくapt（python3-docx）で入れる。Render/Docker環境によっては
# ビルド時にPyPIへ到達できない場合があるため、debianパッケージのほうが確実。
RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice-writer \
      python3 \
      python3-docx \
      fonts-ipafont-gothic \
      fonts-ipafont-mincho \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server.js"]
