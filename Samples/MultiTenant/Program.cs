using System.Reflection;
using Muonroi.BuildingBlock.External;
using Muonroi.BuildingBlock.External.DI;
using Muonroi.BuildingBlock.External.Logging;
using Muonroi.BuildingBlock.External.Tenant;

WebApplicationBuilder builder = WebApplication.CreateBuilder(args);
Assembly assembly = Assembly.GetExecutingAssembly();
ConfigurationManager configuration = builder.Configuration;

builder.AddAppConfiguration();
builder.AddAutofacConfiguration();
builder.ConfigureSerilog();

IServiceCollection services = builder.Services;
services.AddTenantContext(configuration);
services.AddTransient<TenantExampleService>();

WebApplication app = builder.Build();
app.UseMiddleware<TenantContextMiddleware>();
app.MapGet("/tenant", (TenantExampleService svc) => svc.GetTenant());

await app.RunAsync();
