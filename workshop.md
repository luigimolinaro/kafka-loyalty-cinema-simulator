# Workshop – Raccolta Punti con Architettura Event-Driven

## Scopo del workshop

Questo workshop ha l’obiettivo di costruire un’applicazione completa per la raccolta e gestione di punti (ad esempio loyalty, scoring o gamification), utilizzando un’architettura moderna basata su microservizi ed eventi.

Apache Kafka viene utilizzato come componente infrastrutturale per la gestione degli eventi, ma non rappresenta il focus principale: l’attenzione è sull’intero flusso applicativo e sull’integrazione tra frontend, backend e piattaforma di streaming.

---

## Obiettivi principali

Al termine del workshop sarai in grado di:

* Progettare una semplice applicazione event-driven
* Implementare una UI per la raccolta e visualizzazione dei punti
* Costruire servizi backend che producono e consumano eventi
* Utilizzare Kafka come backbone per la comunicazione asincrona
* Comprendere il flusso end-to-end dei dati
* Integrare componenti frontend e backend in modo coerente

---

## Architettura del workshop

L’architettura prevede i seguenti componenti:

* Frontend (UI) per l’inserimento e la visualizzazione dei punti
* Backend applicativo (API) per la gestione delle richieste
* Kafka come sistema di event streaming
* Consumer per l’elaborazione degli eventi (es. calcolo punti, aggiornamenti)
* Kubernetes (kind) per l’esecuzione locale dei servizi
* Helm per il deployment dei componenti

---

## Flusso applicativo

1. L’utente interagisce con la UI inserendo un’azione (es. aggiunta punti)
2. Il backend riceve la richiesta e genera un evento
3. L’evento viene pubblicato su Kafka
4. Uno o più consumer elaborano l’evento
5. Il sistema aggiorna lo stato (es. saldo punti)
6. La UI recupera e mostra i dati aggiornati

### Scenario realistico: punti di raccolta multipli e connettività instabile

Il workshop include la simulazione di più punti di raccolta (ad esempio due punti vendita o due sistemi client distinti):

* Punto A: connesso e operativo in tempo reale
* Punto B: con problemi di connettività

Comportamento simulato:

1. Entrambi i punti generano eventi di accumulo punti
2. Il Punto A invia gli eventi in tempo reale
3. Il Punto B accumula eventi localmente (buffering) a causa della mancanza di rete
4. Quando la connettività viene ripristinata, il Punto B invia gli eventi in ritardo

Obiettivi didattici dello scenario:

* Comprendere la gestione di eventi in ritardo (late events)
* Gestire eventuali duplicati o riordino degli eventi
* Garantire consistenza del saldo punti
* Introdurre concetti di resilienza e disaccoppiamento

Possibili estensioni:

* Introduzione di un identificatore univoco per evento
* Logica di deduplicazione lato consumer
* Gestione dell’ordine degli eventi

---

## Concetti chiave

Durante il workshop verranno affrontati i seguenti concetti:

* Architetture event-driven
* Comunicazione asincrona tra servizi
* Separazione tra frontend e backend
* Gestione dello stato tramite eventi
* Scalabilità e disaccoppiamento dei componenti
* Gestione di eventi in ritardo e sistemi offline-first

Durante il workshop verranno affrontati i seguenti concetti:

* Architetture event-driven
* Comunicazione asincrona tra servizi
* Separazione tra frontend e backend
* Gestione dello stato tramite eventi
* Scalabilità e disaccoppiamento dei componenti

---

## Obiettivo finale

Realizzare un sistema funzionante in cui:

* Un utente può inserire azioni tramite una UI
* Gli eventi vengono gestiti tramite Kafka
* I servizi backend elaborano i dati
* Il sistema aggiorna e restituisce lo stato in modo coerente

---

## Note

* L’ambiente è pensato per sviluppo locale e scopi didattici
* Le configurazioni sono semplificate per facilitare l’apprendimento

---

## Prerequisiti

* Conoscenza base di Docker
* Familiarità con comandi Linux
* Nozioni base di API REST
* Conoscenza base di Kubernetes (opzionale)

---

## Risultato atteso

Alla fine del workshop avrai costruito una piccola applicazione distribuita basata su eventi, comprendendo come integrare una UI, servizi backend e una piattaforma di streaming come Kafka in un’architettura coerente.

