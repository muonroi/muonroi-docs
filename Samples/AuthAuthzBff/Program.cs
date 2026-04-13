using System.Reflection;
using System.Security.Claims;
using Auth.Oidc;
using AuthZ.Policies;
using Bff;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Muonroi.BuildingBlock.External;
using Muonroi.BuildingBlock.External.DI;
using Muonroi.BuildingBlock.External.Logging;

WebApplicationBuilder builder = WebApplication.CreateBuilder(args);
Assembly assembly = Assembly.GetExecutingAssembly();
ConfigurationManager configuration = builder.Configuration;

builder.AddAppConfiguration();
builder.AddAutofacConfiguration();
builder.ConfigureSerilog();

IServiceCollection services = builder.Services;
services.AddBffAuthentication();
services.AddAuthorization();
services.AddHttpClient();

OidcOptions oidc = new()
{
    Authority = "https://id.example.com",
    ClientId = "demo-client",
    RedirectUri = "https://app.example.com/callback",
    Scopes = ["openid", "profile"]
};
services.AddSingleton(oidc);
services.AddSingleton(new PkceClient(oidc));

services.AddHttpClient<OpaAuthorizationService>(client =>
{
    client.BaseAddress = new Uri("http://localhost:8181/");
});

WebApplication app = builder.Build();

app.MapGet("/login", (PkceClient client, HttpContext ctx) =>
{
    AuthorizationRequest auth = client.CreateAuthorizationRequest();
    ctx.Response.Cookies.Append("pkce_code_verifier", auth.CodeVerifier, new CookieOptions
    {
        HttpOnly = true,
        Secure = true,
        SameSite = SameSiteMode.Strict
    });
    return Results.Redirect(auth.Url);
});

app.MapGet("/callback", async (string code, HttpContext ctx, PkceClient client, IHttpClientFactory factory, ITokenStore store, OidcOptions options) =>
{
    string codeVerifier = ctx.Request.Cookies["pkce_code_verifier"] ?? string.Empty;
    HttpClient http = factory.CreateClient();
    TokenResponse token = await client.RedeemCodeForTokenAsync(code, codeVerifier, options.RedirectUri, http);
    if (!string.IsNullOrEmpty(token.RefreshToken))
    {
        await store.StoreRefreshTokenAsync("demo", token.RefreshToken);
    }
    ClaimsIdentity identity = new(CookieAuthenticationDefaults.AuthenticationScheme);
    identity.AddClaim(new Claim(ClaimTypes.Name, "demo"));
    await ctx.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(identity));
    return Results.Redirect("/data");
});

app.MapGet("/data", [Authorize] async (HttpContext ctx, OpaAuthorizationService opa) =>
{
    bool allowed = await opa.AuthorizeAsync(new { path = "/data", subject = ctx.User.Identity?.Name });
    return allowed ? Results.Ok(new { Message = "Sensitive data" }) : Results.Forbid();
});

await app.RunAsync();
