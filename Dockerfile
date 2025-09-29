FROM node:22-alpine

WORKDIR /app

# Копируем только package файлы
COPY package*.json ./

# Устанавливаем зависимости И компилируем native модули в Linux окружении
RUN npm install

# Копируем остальные файлы приложения
COPY . .

EXPOSE 3000

CMD ["node", "server.js"]