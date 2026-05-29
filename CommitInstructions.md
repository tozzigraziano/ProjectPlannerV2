# Istruzioni per la generazione dei messaggi di commit

Scrivi SEMPRE il messaggio di commit in ITALIANO.

Analizza il contenuto effettivo del diff di OGNI file prima di scrivere qualsiasi descrizione.
NON dedurre i cambiamenti dai nomi dei file o dai percorsi: descrivi solo ciò che è realmente cambiato nel codice.

## FILTRA I CAMBIAMENTI DA IGNORARE

Nei file modificati, rimuovi completamente dalla tua analisi i seguenti elementi.
NON menzionarli mai, nemmeno di passaggio, nemmeno raggruppati:

- Timestamp, contatori, GUID auto-generati
- Cambiamenti solo di formattazione (spazi, indentazione)

## IDENTIFICA LE MODIFICHE FUNZIONALI REALI

Analizza il diff effettivo di ogni file rimasto. Raggruppa per sottosistema o cartella.
Ogni gruppo deve descrivere SOLO le modifiche effettivamente presenti in quei file,
senza attribuire cambiamenti da altri gruppi.

**Per C#, Python, JS/TS e altro codice:**
- Modifiche di logica
- Cambiamenti API
- Nuovi metodi/classi
- Bugfix

**Per file JSON, XML, YAML, INI:**
- Modifiche significative di parametri
- Nuove/rimosse voci


## VALUTA L'IMPORTANZA E SCRIVI IL MESSAGGIO

Se dopo i passi 1-3 non rimane nessuna modifica funzionale reale, scrivi:

👍 Commit minore — nessuna modifica funzionale

Altrimenti usa questo formato:

Riga del titolo, OBBLIGATORIA: come prima cosa metti un icona che indica l'importanza del commit, seguita da un **Titolo** breve (max 72 caratteri) che riflette la modifica più importante
Righe successive, descrizioni più dettagliate per ogni gruppo di modifiche, con questo formato:
  - inizia la riga con `[-]` file eliminati (se presenti, sempre in cima)
  - inizia la riga con `[+]` file aggiunti (se presenti)
  - inizia la riga con `[M]` file modificati (se presenti)