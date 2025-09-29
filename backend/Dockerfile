FROM python:3

# Install CA certificates to avoid TLS/SSL issues when connecting to Atlas
RUN apt-get update && \
    apt-get install -y ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app
COPY requirements.txt ./

RUN pip install --no-cache-dir --upgrade -r ./requirements.txt

EXPOSE 3001

CMD ["python", "./src/server.py"]
