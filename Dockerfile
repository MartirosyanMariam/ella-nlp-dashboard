FROM nginx:alpine

# Static dashboard: the single-page app plus the ingested run files it reads.
COPY index.html /usr/share/nginx/html/index.html
COPY data/ /usr/share/nginx/html/data/
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
