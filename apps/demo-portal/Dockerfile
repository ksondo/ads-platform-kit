FROM nginx:1.27-alpine
COPY apps/demo-portal/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/demo-portal/index.html /usr/share/nginx/html/index.html
COPY apps/demo-portal/styles.css /usr/share/nginx/html/styles.css
COPY apps/demo-portal/main.js /usr/share/nginx/html/main.js
COPY apps/demo-portal/opportunities-page.js /usr/share/nginx/html/opportunities-page.js
COPY apps/demo-portal/opportunities.css /usr/share/nginx/html/opportunities.css
COPY apps/demo-portal/catalogue.json /usr/share/nginx/html/catalogue.json
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
