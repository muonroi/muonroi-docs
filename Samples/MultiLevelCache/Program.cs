using System.Reflection;
using Muonroi.BuildingBlock.External;
using Muonroi.BuildingBlock.External.Caching.Distributed.MultiLevel;
using Muonroi.BuildingBlock.External.DI;
using Muonroi.BuildingBlock.External.Logging;

WebApplicationBuilder builder = WebApplication.CreateBuilder(args);
Assembly assembly = Assembly.GetExecutingAssembly();
ConfigurationManager configuration = builder.Configuration;

builder.AddAppConfiguration();
builder.AddAutofacConfiguration();
builder.ConfigureSerilog();

IServiceCollection services = builder.Services;
services.AddMultiLevelCaching(configuration);
services.AddTransient<CacheExampleService>();

WebApplication app = builder.Build();
app.MapGet("/cache", async (CacheExampleService svc) => await svc.GetDataAsync());

await app.RunAsync();
