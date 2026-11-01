//! https with your own certificate files (MRP_TLS=files). Most setups put Caddy in front instead,
//! which gets and renews certificates by itself (see docker-compose.yml).

use axum::Router;
use rustls::pki_types::{pem::PemObject, CertificateDer, PrivateKeyDer};
use std::sync::Arc;

pub fn from_files(cert: &str, key: &str) -> Arc<rustls::ServerConfig> {
    let certs: Vec<CertificateDer<'static>> = CertificateDer::pem_file_iter(cert).expect("read MRP_TLS_CERT").flatten().collect();
    let key = PrivateKeyDer::from_pem_file(key).expect("read MRP_TLS_KEY");
    Arc::new(
        rustls::ServerConfig::builder_with_provider(Arc::new(rustls::crypto::ring::default_provider()))
            .with_safe_default_protocol_versions()
            .unwrap()
            .with_no_client_auth()
            .with_single_cert(certs, key)
            .expect("the certificate and key don't match"),
    )
}

pub async fn serve(listener: tokio::net::TcpListener, router: Router, tls: Arc<rustls::ServerConfig>) {
    let acceptor = tokio_rustls::TlsAcceptor::from(tls);
    loop {
        let Ok((stream, _)) = listener.accept().await else { continue };
        let (router, acceptor) = (router.clone(), acceptor.clone());
        tokio::spawn(async move {
            if let Ok(s) = acceptor.accept(stream).await {
                let svc = hyper_util::service::TowerToHyperService::new(router);
                let _ = hyper::server::conn::http1::Builder::new().serve_connection(hyper_util::rt::TokioIo::new(s), svc).await;
            }
        });
    }
}
