{ pkgs, ... }: {
  # Выбираем стабильную версию окружения
  channel = "stable-24.05"; 

  # 1. Устанавливаем Python, чтобы он мог запустить сервер для ваших файлов
  packages = [
    pkgs.python3
  ];

  # Настройки среды
  env = {};

  idx = {
    extensions = [];

    # 2. Настраиваем превью
    previews = {
      enable = true;
      previews = {
        web = {
          # Команда: запустить python-сервер на нужном порту
          command = ["python3" "-m" "http.server" "$PORT" "--bind" "0.0.0.0"];
          manager = "web";
        };
      };
    };
  };
}