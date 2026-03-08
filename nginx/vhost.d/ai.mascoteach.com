# Custom location config cho ai.mascoteach.com
# Xử lý WebSocket upgrade cho /ws/ paths

# Tăng timeout cho AI generation
proxy_read_timeout 300s;
proxy_connect_timeout 60s;
proxy_send_timeout 300s;

# Cho phép upload file lớn
client_max_body_size 50M;

# Hỗ trợ WebSocket - đảm bảo Upgrade headers được forward
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection $proxy_connection;
