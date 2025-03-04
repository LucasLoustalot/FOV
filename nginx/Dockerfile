FROM ubuntu:latest

EXPOSE 8080
EXPOSE 80
EXPOSE 1935

RUN apt update 

RUN apt install -y nginx libnginx-mod-rtmp

COPY nginx.conf /etc/nginx/nginx.conf

CMD ["nginx", "-g", "daemon off;"]