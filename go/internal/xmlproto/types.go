package xmlproto

// ModulePropertyID maps module type name to its property UUID
var ModulePropertyID = map[string]string{
	"ObjectModule":              "a637f77f-3840-441d-a1c3-699c8c5cb7e0",
	"ManagerModule":             "d1b64a2c-8078-4982-8190-8f81aefda192",
	"RecordSetModule":           "9f36fd70-4bf4-47f6-b235-935f73aab43f",
	"ValueManagerModule":        "3e58c91f-9aaa-4f42-8999-4baf33907b75",
	"FormModule":                "32e087ab-1491-49b6-aba7-43571b41ac2b",
	"CommandModule":             "078a6af8-d22c-4248-9c33-7e90075a3d2c",
	"CommonModule":              "d5963243-262e-4398-b4d7-fb16d06484f6",
	"ApplicationModule":         "d22e852a-cf8a-4f77-8ccb-3548e7792bea",
	"SessionModule":             "9b7bbbae-9771-46f2-9e4d-2489e0ffc702",
	"ExternalConnectionModule":  "a4a9c1e2-1e54-4c7f-af06-4ca341198fac",
	"OrdinaryApplicationModule": "a78d9ce3-4e0c-48d5-9863-ae7342eedf94",
}

// ModuleTypePrefix maps simple module type to 1C platform composite type prefix
var ModuleTypePrefix = map[string]string{
	"ObjectModule":              "DocumentObject",
	"ManagerModule":             "DocumentManager",
	"FormModule":                "DocumentForm",
	"RecordSetModule":           "DocumentRecordSet",
	"CommonModule":              "CommonModule",
	"ApplicationModule":         "ApplicationModule",
	"SessionModule":             "SessionModule",
	"ExternalConnectionModule":  "ExternalConnectionModule",
	"OrdinaryApplicationModule": "OrdinaryApplicationModule",
	"ValueManagerModule":        "InformationRegisterValueManager",
}

type TargetID struct {
	ID    string
	SeqNo int
	AppID string
	IDStr string
}

type ModuleID struct {
	Type          string
	Name          string
	URL           string
	ExtensionName string
	ObjectID      string
	PropertyID    string
}

type Breakpoint struct {
	Line int
}

type BPObject struct {
	ModuleID ModuleID
	Lines    []int
}

type BPWorkspace struct {
	Objects []BPObject
}

type StackFrame struct {
	ModuleID ModuleID
	LineNo   int
}
