{{/*
Expand the name of the chart.
*/}}
{{- define "training.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "training.fullname" -}}
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
{{- define "training.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "training.labels" -}}
helm.sh/chart: {{ include "training.chart" . }}
{{ include "training.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "training.selectorLabels" -}}
app.kubernetes.io/name: {{ include "training.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Shell component selector labels
*/}}
{{- define "training.shell.selectorLabels" -}}
{{ include "training.selectorLabels" . }}
app.kubernetes.io/component: shell
{{- end }}

{{/*
UI component selector labels
*/}}
{{- define "training.ui.selectorLabels" -}}
{{ include "training.selectorLabels" . }}
app.kubernetes.io/component: ui
{{- end }}

{{/*
tty2web component selector labels
*/}}
{{- define "training.tty2web.selectorLabels" -}}
{{ include "training.selectorLabels" . }}
app.kubernetes.io/component: tty2web
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "training.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "training.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Shell pod name (StatefulSet pod-0)
*/}}
{{- define "training.shell.podName" -}}
{{- printf "%s-shell-0" (include "training.fullname" .) }}
{{- end }}
