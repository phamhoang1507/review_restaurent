FROM golang:1.24.8-bookworm AS builder

ENV CGO_ENABLED=0

RUN GOBIN=/out go install \
    github.com/minio/minio@RELEASE.2025-10-15T17-29-55Z

RUN cp /go/pkg/mod/github.com/minio/minio@*/LICENSE /out/LICENSE

FROM debian:bookworm-slim

COPY --from=builder /etc/ssl/certs/ca-certificates.crt \
    /etc/ssl/certs/ca-certificates.crt

COPY --from=builder /out/minio /usr/local/bin/minio
COPY --from=builder /out/LICENSE /usr/share/licenses/minio/LICENSE

RUN groupadd --gid 10001 minio \
    && useradd --uid 10001 --gid minio --create-home minio \
    && mkdir -p /data \
    && chown minio:minio /data

USER minio

WORKDIR /data

EXPOSE 9000 9001

ENTRYPOINT ["/usr/local/bin/minio"]