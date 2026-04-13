using System.Reflection;
using Muonroi.BuildingBlock.External;
using Muonroi.BuildingBlock.External.DI;
using Muonroi.BuildingBlock.External.Logging;
using Microsoft.Extensions.Caching.Memory;

WebApplicationBuilder builder = WebApplication.CreateBuilder(args);
Assembly assembly = Assembly.GetExecutingAssembly();
ConfigurationManager configuration = builder.Configuration;

builder.AddAppConfiguration();
builder.AddAutofacConfiguration();
builder.ConfigureSerilog();

IServiceCollection services = builder.Services;
services.AddMemoryCache();
services.AddTransient<MemoryExampleService>();

WebApplication app = builder.Build();
app.MapGet("/memory", (MemoryExampleService svc) => svc.GetData());

await app.RunAsync();
