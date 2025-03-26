# EIP - FOV Website

The FOV Website

Install Nginx :
```
sudo apt install nginx libnginx-mod-rtmp
```

nginx.conf (/etc/nginx/nginx.conf):

```
user www-data;
worker_processes auto;
pid /run/nginx.pid;
error_log /var/log/nginx/error.log;
include /etc/nginx/modules-enabled/*.conf;

events {
 worker_connections 768;
 # multi_accept on;
}

rtmp {
    server {
        listen 1935;
        chunk_size 4096;

        application live {
            live on;
            deny play all; # Disable external access for security

            # Enable HLS for each stream
            hls on;
            hls_path /tmp/hls;
            hls_fragment 3;
            hls_playlist_length 60;

            # Define stream keys
            hls_variant _stream1 BANDWIDTH=1000000; # Stream 1
            hls_variant _stream2 BANDWIDTH=1000000; # Stream 2
        }
    }
}

http {
    server {
        listen 8080;

        location /hls {
            types {
                application/vnd.apple.mpegurl m3u8;
                video/mp2t ts;
            }
            root /tmp;
            add_header Cache-Control no-cache;
            add_header Access-Control-Allow-Origin *;
            add_header Access-Control-Allow-Methods 'GET, OPTIONS';
            add_header Access-Control-Allow-Headers 'Origin, X-Requested-With, Content-Type, Accept';
        }
    }
}

#mail {
# # See sample authentication script at:
# # http://wiki.nginx.org/ImapAuthenticateWithApachePhpScript
#
# # auth_http localhost/auth.php;
# # pop3_capabilities "TOP" "USER";
# # imap_capabilities "IMAP4rev1" "UIDPLUS";
#
# server {
#  listen     localhost:110;
#  protocol   pop3;
#  proxy      on;# }
#
# server {
#  listen     localhost:143;
#  protocol   imap;
#  proxy      on;
# }
#}
```

restart nginx
```
sudo systemctl restart nginx
```

obs-cli:
```
sudo apt install obs-cli
```

start http-server:
```
sudo npm install -g http-server
cd proto/
http-server
```

Set up OBS
The stream key will be used to separate the different stream as you can se on the nginx conf
```
# Define stream keys
hls_variant _stream1 BANDWIDTH=1000000; # Stream 1
hls_variant _stream2 BANDWIDTH=1000000; # Stream 2
```
![Stream settings](https://i.imgur.com/VqlS9Lh.png "OBS")

and then start obs, with the custom settings in obs.sh
```
./obs.sh
```
