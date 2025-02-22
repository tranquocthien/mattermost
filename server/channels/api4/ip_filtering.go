// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package api4

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/shared/mlog"
	"github.com/mattermost/mattermost/server/v8/channels/app"
	"github.com/mattermost/mattermost/server/v8/channels/audit"
	"github.com/mattermost/mattermost/server/v8/einterfaces"
)

func (api *API) InitIPFiltering() {
	api.BaseRoutes.IPFiltering.Handle("", api.APISessionRequired(getIPFilters)).Methods("GET")
	api.BaseRoutes.IPFiltering.Handle("", api.APISessionRequired(applyIPFilters)).Methods("POST")
	api.BaseRoutes.IPFiltering.Handle("/my_ip", api.APISessionRequired(myIP)).Methods("GET")
}

func ensureIPFilteringInterface(c *Context, where string) (einterfaces.IPFilteringInterface, bool) {
	if c.App.IPFiltering() == nil || !c.App.Config().FeatureFlags.CloudIPFiltering || c.App.License() == nil || c.App.License().SkuShortName != model.LicenseShortSkuEnterprise {
		c.Err = model.NewAppError(where, "api.context.ip_filtering.not_available.app_error", nil, "", http.StatusNotImplemented)
		return nil, false
	}
	return c.App.IPFiltering(), true
}

func getIPFilters(c *Context, w http.ResponseWriter, r *http.Request) {
	ipFiltering, ok := ensureIPFilteringInterface(c, "getIPFilters")
	if !ok {
		return
	}

	if !c.App.SessionHasPermissionTo(*c.AppContext.Session(), model.PermissionSysconsoleReadIPFilters) {
		c.SetPermissionError(model.PermissionSysconsoleReadIPFilters)
		return
	}

	allowedRanges, err := ipFiltering.GetIPFilters()
	if err != nil {
		c.Err = model.NewAppError("getIPFilters", "api.context.ip_filtering.get_ip_filters.app_error", nil, err.Error(), http.StatusInternalServerError)
		return
	}

	if err := json.NewEncoder(w).Encode(allowedRanges); err != nil {
		c.Err = model.NewAppError("getIPFilters", "api.context.ip_filtering.get_ip_filters.app_error", nil, err.Error(), http.StatusInternalServerError)
		return
	}
}

func applyIPFilters(c *Context, w http.ResponseWriter, r *http.Request) {
	ipFiltering, ok := ensureIPFilteringInterface(c, "applyIPFilters")
	if !ok {
		return
	}

	if !c.App.SessionHasPermissionTo(*c.AppContext.Session(), model.PermissionSysconsoleWriteIPFilters) {
		c.SetPermissionError(model.PermissionSysconsoleWriteIPFilters)
		return
	}

	auditRec := c.MakeAuditRecord("applyIPFilters", audit.Fail)
	defer c.LogAuditRecWithLevel(auditRec, app.LevelContent)

	allowedRanges := &model.AllowedIPRanges{} // Initialize the allowedRanges variable
	if err := json.NewDecoder(r.Body).Decode(allowedRanges); err != nil {
		c.Err = model.NewAppError("applyIPFilters", "api.context.ip_filtering.apply_ip_filters.app_error", nil, err.Error(), http.StatusInternalServerError)
		return
	}

	audit.AddEventParameterAuditable(auditRec, "IPFilter", allowedRanges)

	updatedAllowedRanges, err := ipFiltering.ApplyIPFilters(allowedRanges)

	if err != nil {
		c.Err = model.NewAppError("applyIPFilters", "api.context.ip_filtering.apply_ip_filters.app_error", nil, err.Error(), http.StatusInternalServerError)
		return
	}

	auditRec.Success()

	cloudWorkspaceOwnerEmailAddress := ""
	if c.App.License().IsCloud() {
		portalUserCustomer, cErr := c.App.Cloud().GetCloudCustomer(c.AppContext.Session().UserId)
		if cErr != nil {
			c.Logger.Error("Failed to get portal user customer", mlog.Err(cErr))
		}
		if cErr == nil && portalUserCustomer != nil {
			cloudWorkspaceOwnerEmailAddress = portalUserCustomer.Email
		}
	}

	go func() {
		initiatingUser, err := c.App.Srv().Store().User().GetProfileByIds(context.Background(), []string{c.AppContext.Session().UserId}, nil, true)
		if err != nil {
			c.Logger.Error("Failed to get initiating user", mlog.Err(err))
		}

		users, err := c.App.Srv().Store().User().GetSystemAdminProfiles()
		if err != nil {
			c.Logger.Error("Failed to get system admins", mlog.Err(err))
		}

		for _, user := range users {
			if err = c.App.Srv().EmailService.SendIPFiltersChangedEmail(user.Email, initiatingUser[0], *c.App.Config().ServiceSettings.SiteURL, *c.App.Config().CloudSettings.CWSURL, user.Locale, cloudWorkspaceOwnerEmailAddress == user.Email); err != nil {
				c.Logger.Error("Error while sending IP filters changed email", mlog.Err(err))
			}
		}
	}()

	if err := json.NewEncoder(w).Encode(updatedAllowedRanges); err != nil {
		c.Err = model.NewAppError("getIPFilters", "api.context.ip_filtering.get_ip_filters.app_error", nil, err.Error(), http.StatusInternalServerError)
		return
	}
}

func myIP(c *Context, w http.ResponseWriter, r *http.Request) {
	_, ok := ensureIPFilteringInterface(c, "myIP")

	if !ok {
		return
	}

	response := &model.GetIPAddressResponse{
		IP: c.AppContext.IPAddress(),
	}

	json, err := json.Marshal(response)
	if err != nil {
		c.Err = model.NewAppError("myIP", "api.context.ip_filtering.get_my_ip.failed", nil, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Write(json)
}
