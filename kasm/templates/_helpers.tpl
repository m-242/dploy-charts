{{/*
Expand the name of the chart.
*/}}
{{- define "kasm-kali.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "kasm-kali.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "kasm-kali.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "kasm-kali.labels" -}}
helm.sh/chart: {{ include "kasm-kali.chart" . }}
{{ include "kasm-kali.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "kasm-kali.selectorLabels" -}}
app.kubernetes.io/name: {{ include "kasm-kali.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "kasm-kali.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "kasm-kali.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Generate VNC password - use provided or generate random
*/}}
{{- define "kasm-kali.vncPassword" -}}
{{- .Values.kasm.vncPassword | default (randAlphaNum 12) }}
{{- end }}

{{/*
Generate base64-encoded basic auth credentials for auto-injection
*/}}
{{- define "kasm-kali.basicAuthHeader" -}}
{{- $username := .Values.username | default .Values.kasm.user -}}
{{- $password := .Values.uuid | default (include "kasm-kali.vncPassword" .) -}}
{{- printf "%s:%s" $username $password | b64enc -}}
{{- end }}
