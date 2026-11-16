# Luật của dự án

Luật cứng. Muốn phá một luật thì phải hỏi chủ dự án trước.

1. **Spec đổi trước, code đổi sau.** Đổi hành vi phải qua `/spec change`. (Để spec luôn là nguồn sự thật.)
2. **Không build step, không framework, không thư viện runtime.** (Deploy chỉ là copy thư mục `public/`; `wrangler` là devDependency duy nhất.)
3. **Chỉ lưu trên R2.** Không KV, không D1. (Một kho, một rule xoá 7 ngày.)
4. **UI và thông báo cho người dùng bằng tiếng Việt.**
5. **Không để key LLM/Groq ở client.** Chỉ `APP_TOKEN` nằm trong `localStorage`. (Key chỉ ở secret của Pages.)
6. **Gói đăng bài chỉ dùng dữ liệu có trong input.** Không bịa công dụng, số liệu, chứng nhận; không từ khẳng định điều trị ("trị dứt", "chữa", "hết 100%"). (Rủi ro vi phạm chính sách sàn và quảng cáo.)
7. **`/media` chỉ phục vụ key khớp `^p\/[a-z0-9]+\/[\w.-]+$`.** (Endpoint này không cần token.)
8. **Không tự deploy, tạo bucket, đặt secret hay `wrangler login`.** Chuẩn bị lệnh cho chủ dự án chạy. (Đó là tài khoản Cloudflare của chủ dự án.)
9. **Không commit khi chưa được bảo. Chỉ đánh dấu xong sau khi đã chạy kiểm tra thật.** Tiêu chí cần thiết bị thật thì ghi "chờ chủ dự án kiểm".
