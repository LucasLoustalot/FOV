FROM ubuntu:latest

EXPOSE 8080
EXPOSE 80
EXPOSE 1935

RUN apt update

RUN apt install -y npm

COPY . /app/

WORKDIR /app

RUN ls

RUN npm install -g http-server

CMD [ "http-server" ]